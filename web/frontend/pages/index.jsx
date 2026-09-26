import { useState } from "react";
import { Page } from "@shopify/polaris";
import { useAppQuery, useAuthenticatedFetch } from "../hooks";
import "../assets/m_stylesheet.css";
import { useAppBridge } from "@shopify/app-bridge-react";

export default function HomePage() {
  const [isLoadingSubscribe, setIsLoadingSubscribe] = useState(false);
  const shopify = useAppBridge();
  const fetch = useAuthenticatedFetch();

  const { data } = useAppQuery({ url: "/api/getshop" });
  const { data: subData } = useAppQuery({
    url: "/api/hasActiveSubscription",
  });
  const { data: planData } = useAppQuery({ url: "/api/plan-info" });

  const hasSubscription = subData?.hasActiveSubscription === true;
  const planPrice = planData
    ? `$${parseFloat(planData.amount).toFixed(2)}/month or $${parseFloat(planData.annualAmount).toFixed(2)}/year`
    : "$30.00/month or $300.00/year";
  const trialDays = planData?.trialDays > 0 ? ` + ${planData.trialDays}-day free trial` : "";

  const supportEmail = "mailto:admin@buxtonscaffolding.to";

  function openThemeEditor() {
    const url = `https://${data?.shop}/admin/themes/current/editor?template=index`;
    window.open(url);
  }

  async function subscribePlan() {
    setIsLoadingSubscribe(true);
    try {
      const res = await fetch("/api/createSubscription");
      if (!res.ok) {
        throw new Error("Server error");
      }
      const data = await res.json();
      setIsLoadingSubscribe(false);
      if (data.error) {
        shopify.toast.show("Failed to create subscription", { isError: true });
      } else if (data.confirmationUrl) {
        shopify.toast.show("Redirecting to payment page..");
        window.open(data.confirmationUrl, "_top");
      } else if (data.isActiveSubscription) {
        shopify.toast.show("You already have an active subscription");
      }
    } catch (e) {
      setIsLoadingSubscribe(false);
      shopify.toast.show("Something went wrong. Please try again.", {
        isError: true,
      });
    }
  }

  return (
    <Page>
      <div className="m-dashboard">
        {/* Subscription Banner */}
        <div className={`m-status-banner ${hasSubscription ? "m-status-premium" : "m-status-free"}`}>
          <strong>{hasSubscription ? "Plan: Premium Gold" : "Plan: Free"}</strong>
          <p>
            {hasSubscription
              ? "You have access to all premium features."
              : "You are on the Free plan with limited features."}
          </p>
        </div>

        {/* Hero */}
        <div className="m-hero">
          <div className="m-hero-content">
            <h1 className="m-hero-title">Snap Compare</h1>
            <p className="m-hero-subtitle">
              Transform your product presentation with interactive
              before-and-after comparisons that drive engagement and
              conversions.
            </p>
            <div className="m-hero-actions">
              <button className="m-btn m-btn-white" onClick={openThemeEditor}>
                Open Theme Editor
              </button>
              <button className="m-btn m-btn-outline" onClick={() => window.open(supportEmail)}>
                Contact Support
              </button>
            </div>
          </div>
        </div>

        {/* Video */}
        <div className="m-video-wrapper">
          <iframe
            src="https://www.youtube.com/embed/UQ7OtkzmzTE"
            title="Snap Compare Demo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ width: "100%", aspectRatio: "9/16", border: "none", borderRadius: "12px", maxHeight: "500px" }}
          />
        </div>

        {/* Features */}
        <div className="m-section">
          <h2 className="m-section-title">Why Snap Compare?</h2>
          <div className="m-features">
            <div className="m-feature-card">
              <div className="m-feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--m-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
              </div>
              <h3>Interactive Comparison</h3>
              <p>Drag-to-compare slider for dynamic image comparisons that engage customers instantly.</p>
            </div>
            <div className="m-feature-card">
              <div className="m-feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--m-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              </div>
              <h3>Brand Customization</h3>
              <p>Match colors, fonts, and styling to your brand for a seamless, consistent look.</p>
            </div>
            <div className="m-feature-card">
              <div className="m-feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--m-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <h3>Zero-Code Setup</h3>
              <p>Add to any theme in clicks — no developer or coding skills required.</p>
            </div>
            <div className="m-feature-card">
              <div className="m-feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--m-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </div>
              <h3>Fully Responsive</h3>
              <p>Looks great on desktops, tablets, and phones with automatic resizing.</p>
            </div>
          </div>
        </div>

        {/* Plan Comparison */}
        <div className="m-section">
          <h2 className="m-section-title">Choose Your Plan</h2>
          <div className="m-plan-card">
            <table className="m-plan-table">
              <thead>
                <tr>
                  <th className="m-th-left">Features</th>
                  <th>Free</th>
                  <th className="m-th-premium">Premium</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Cost", "Free", `${planPrice}${trialDays}`],
                  ["Interactive Visual Comparison", "Basic", "Enhanced"],
                  ["Customizable Overlay Settings", "Limited", "\u2713"],
                  ["Effortless Integration", "Standard", "Priority"],
                  ["Responsive Design", "\u2713", "\u2713"],
                  ["Details Text", "\u2014", "\u2713"],
                  ["Priority Support", "\u2014", "\u2713"],
                ].map((row, i) => (
                  <tr key={i} className={i % 2 ? "m-row-alt" : ""}>
                    <td className="m-td-feature">{row[0]}</td>
                    <td className="m-td-center">{row[1]}</td>
                    <td className="m-td-center">{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="m-plan-actions">
              {!hasSubscription && (
                <button
                  className="m-btn m-btn-primary"
                  onClick={subscribePlan}
                  disabled={isLoadingSubscribe}
                >
                  {isLoadingSubscribe ? "Loading..." : "Upgrade to Premium"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Support Bar */}
        <div className="m-review-bar">
          <span>Need help? Reach out to us.</span>
          <a href={supportEmail} className="m-review-link">
            Contact Support
          </a>
        </div>
      </div>
    </Page>
  );
}
