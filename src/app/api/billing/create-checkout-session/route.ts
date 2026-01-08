import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || "");
}

function getPriceIds() {
  return {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    agency: process.env.STRIPE_PRICE_AGENCY,
  };
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const PRICE_IDS = getPriceIds();
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

    if (!tier || !["starter", "pro", "agency"].includes(tier)) {
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
      },
      subscription_data: {
        metadata: {
          organization_id: organization.id,
          tier,
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

