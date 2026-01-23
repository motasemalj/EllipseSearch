import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrencyFromHeaders } from "@/lib/pricing";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || "");
}

/**
 * Stripe Price IDs for each tier and currency
 *
 * Pricing:
 * USD
 * - Starter: USD 70/month
 * - Pro: USD 300/month
 *
 * AED (UAE)
 * - Starter: AED 250/month
 * - Pro: AED 1,100/month
 *
 * SAR (Saudi)
 * - Starter: SAR 260/month
 * - Pro: SAR 1,200/month
 *
 * Agency: Custom (contact sales)
 */
function getPriceIds(currency: "USD" | "AED" | "SAR") {
  switch (currency) {
    case "AED":
      return {
        starter: process.env.STRIPE_PRICE_AED_STARTER,
        pro: process.env.STRIPE_PRICE_AED_PRO,
      };
    case "SAR":
      return {
        starter: process.env.STRIPE_PRICE_SAR_STARTER,
        pro: process.env.STRIPE_PRICE_SAR_PRO,
      };
    default:
      return {
        starter: process.env.STRIPE_PRICE_USD_STARTER,
        pro: process.env.STRIPE_PRICE_USD_PRO,
      };
  }
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const currency = getCurrencyFromHeaders(request.headers);
    const PRICE_IDS = getPriceIds(currency);
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const { tier } = await request.json();

    if (!tier || !["starter", "pro"].includes(tier)) {
      // Agency tier requires contacting sales - not available for self-service checkout
      if (tier === "agency") {
        return NextResponse.json(
          { error: "Agency plan requires contacting sales. Please reach out to our team." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "Invalid tier selected" },
        { status: 400 }
      );
    }

    const priceId = PRICE_IDS[tier as keyof typeof PRICE_IDS];
    if (!priceId) {
      return NextResponse.json(
        { error: "Price not configured for this tier" },
        { status: 400 }
      );
    }

    // Get user's profile and organization
    const { data: profile } = await supabase
      .from("profiles")
      .select("*, organizations(*)")
      .eq("id", user.id)
      .single();

    if (!profile?.organizations) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const organization = profile.organizations;
    let stripeCustomerId = organization.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          organization_id: organization.id,
          organization_name: organization.name,
        },
      });

      stripeCustomerId = customer.id;

      // Save customer ID to organization
      await supabase
        .from("organizations")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", organization.id);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?canceled=true`,
      metadata: {
        organization_id: organization.id,
        tier,
        currency,
      },
      subscription_data: {
        metadata: {
          organization_id: organization.id,
          tier,
          currency,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout session error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

