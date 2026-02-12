import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { type BillingTier } from "@/types";

// Lazy initialization to prevent build-time errors
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || "");
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "No signature provided" },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  console.log(`Processing Stripe webhook: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = getSupabase();
  const organizationId = session.metadata?.organization_id;
  const tier = session.metadata?.tier as BillingTier;

  if (!organizationId || !tier) {
    console.error("Missing metadata in checkout session");
    return;
  }

  // Mark trial as converted if upgrading from trial
  const { data: currentOrg } = await supabase
    .from("organizations")
    .select("tier")
    .eq("id", organizationId)
    .single();

  const wasOnTrial = currentOrg?.tier === 'trial';

  await supabase
    .from("organizations")
    .update({
      tier,
      stripe_subscription_id: session.subscription as string,
      stripe_subscription_status: "active",
      // Mark trial as converted if they were on trial
      trial_converted: wasOnTrial ? true : undefined,
      subscription_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);

  console.log(`Checkout complete for org ${organizationId}: ${tier} plan${wasOnTrial ? ' (converted from trial)' : ''}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const supabase = getSupabase();
  const organizationId = subscription.metadata?.organization_id;
  
  if (!organizationId) {
    // Try to find by customer ID
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("stripe_customer_id", subscription.customer as string)
      .single();

    if (!org) {
      console.error("Organization not found for subscription");
      return;
    }

    await updateOrganizationSubscription(org.id, subscription);
    return;
  }

  await updateOrganizationSubscription(organizationId, subscription);
}

async function updateOrganizationSubscription(
  organizationId: string,
  subscription: Stripe.Subscription
) {
  const supabase = getSupabase();
  const tier = (subscription.metadata?.tier || "starter") as BillingTier;
  const status = subscription.status;

  const updates: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: status,
    updated_at: new Date().toISOString(),
  };

  // Update tier if active
  if (status === "active" || status === "trialing") {
    updates.tier = tier;
  }

  await supabase
    .from("organizations")
    .update(updates)
    .eq("id", organizationId);

  console.log(`Subscription updated for org ${organizationId}: ${status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabase = getSupabase();
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (!org) {
    console.error("Organization not found for deleted subscription");
    return;
  }

  await supabase
    .from("organizations")
    .update({
      tier: "free",
      stripe_subscription_status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", org.id);

  console.log(`Subscription canceled for org ${org.id}`);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const supabase = getSupabase();
  // Refresh credits on successful payment
  const sub = (invoice as unknown as { subscription?: string | null }).subscription;
  const subscriptionId = typeof sub === 'string' ? sub : null;
  
  if (!subscriptionId) return;

  const { data: org } = await supabase
    .from("organizations")
    .select("id, tier")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!org) return;

  // Calculate subscription period end (1 month from now)
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await supabase
    .from("organizations")
    .update({
      subscription_period_end: periodEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", org.id);

  console.log(`Subscription renewed for org ${org.id}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const supabase = getSupabase();
  const sub = (invoice as unknown as { subscription?: string | null }).subscription;
  const subscriptionId = typeof sub === 'string' ? sub : null;
  
  if (!subscriptionId) return;

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!org) return;

  await supabase
    .from("organizations")
    .update({
      stripe_subscription_status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("id", org.id);

  console.log(`Payment failed for org ${org.id}`);
}

