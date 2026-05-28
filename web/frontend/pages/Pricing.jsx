import {
    Page,
    Card,
    Layout,
    Icon,
    DataTable,
    TopBar,
    Button,
    Frame,
} from "@shopify/polaris";

import { CircleTickMinor, HomeMajor, ChecklistMajor, QuestionMarkMajor, CashDollarMajor } from '@shopify/polaris-icons';

import { ActiveSubscription } from "../components/ActiveSubscriptionCheck";
import { shopifyBackground } from "../assets";

import { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "react-query";
import { ThemeValidate } from "../components/ThemeSelection";

import { useAppQuery, useAuthenticatedFetch } from "../hooks";
import { useAppBridge } from "@shopify/app-bridge-react";

export default function Pricing() {
    const [isLoadingSubscribe, setIsLoadingSubscribe] = useState(false);
    const [isLoadingCancelSubscribe, setIsLoadingCancelSubscribe] = useState(false);
    const shopify = useAppBridge();
    const fetch = useAuthenticatedFetch();

    const { data: planInfo } = useAppQuery({ url: "/api/plan-info" });
    const planName = planInfo?.name || "Pro";
    const planPrice = planInfo ? `$${planInfo.amount.toFixed(2)}/${planInfo.interval === "ANNUAL" ? "year" : "month"}` : "—";
    const trialText = planInfo?.trialDays > 0 ? ` · ${planInfo.trialDays}-day free trial` : "";

    const queryClient = useQueryClient();
    const { data: subscriptionData } = useAppQuery({ url: "/api/hasActiveSubscription" });
    const isSubscribed = subscriptionData?.hasActiveSubscription ?? false;

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("charge_id")) {
            queryClient.invalidateQueries("/api/hasActiveSubscription");
        }
    }, []);

    const {
        data,
    } = useAppQuery({
        url: "/api/getshop",
    });


    function openThemeEditor() {
        console.log("Shop: " + data?.shop);
        window.open("https://" + data?.shop + "/admin/themes/current/editor");
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
                console.log(data.error);
                shopify.toast.show("Failed to create subscription", { isError: true });
            } else if (data.confirmationUrl) {
                const { confirmationUrl } = data;
                shopify.toast.show("Redirecting to payment page..");
                window.open(confirmationUrl, "_top");
            } else if (data.isActiveSubscription) {
                console.log("Already subscribed")
                shopify.toast.show("You already have an active subscription");
            }
        } catch (error) {
            console.error(error);
            setIsLoadingSubscribe(false);
            shopify.toast.show("Something went wrong. Please try again.", { isError: true });
        }
    }



    async function cancelSubscription() {
        setIsLoadingCancelSubscribe(true);
        const res = await fetch("/api/cancelSubscription"); //fetch instance of userLoggedInFetch(app)
        const data = await res.json();
        setIsLoadingCancelSubscribe(false);
        console.log(data.status);
        if (data.status === "CANCELLED") {
          shopify.toast.show("Successfully Cancelled the subscription");
          window.location.reload();
        } else {
          shopify.toast.show("Failed to cancel the subscription", { isError: true });
        }
    
      }

    const tickIcon = <Icon
        source={CircleTickMinor}
        color="success"
    />

    const rows = [
        ['Cost', 'Free', planPrice + trialText],
        ['Product Collection Selection ', tickIcon, tickIcon,],
        ['Bundle product limit per product', '2', '5',],
        ['Embed button in product image', '-', tickIcon,],
        ['Product CTA(Add to cart)', tickIcon, tickIcon,],
        ['No Powered By Snap Compare', '-', tickIcon,],
        ['Custom Style Settings', '-', tickIcon,],
        ['Email/Chat Support', '-', tickIcon,],
        ['Free installation support', '-', tickIcon,],
        ['Theme Selection', '-', tickIcon,]
      ];
    
    

    // m-lookbook-hearder-part-starting

    const navigate = useNavigate();

    const logo = {

        width: 450,
        height: 90,

        topBarSource: '',
        url: '/',
        accessibilityLabel: 'Snap Compare',

    };

    const gotoHomePage = () => {
        navigate("/");
    }

    const gotoSupportPage = () => {
        navigate("/support");
    }

    const gotoPricingPage = () => {
        navigate("/pricing");
    }

    const secondaryMenuMarkup = (
        <TopBar.Menu
            activatorContent={
                <div className="main-icon">
                    <div className="main-icon-1"><Button onClick={gotoHomePage} plain monochrome removeUnderline fullWidth >
                        <div className="m-icon-show-1"><Icon source={HomeMajor} /><span className="m-hover-text-1"> <h1>Home</h1></span></div></Button>

                    </div>
                </div>
            }

        />
    );




    const topBarMarkup = (
        <TopBar
            secondaryMenu={secondaryMenuMarkup}

        />
    );



    return (
        <Frame topBar={topBarMarkup} logo={logo} >
            <Page>
                <Layout>
                    <Layout.Section>
                        <div className="planComparison2">
                            <Card title="Plan Comparison" sectioned

                                primaryFooterAction={!isSubscribed ? {
                                    content: `Subscribe to ${planName}`,
                                    onAction: () => {
                                        subscribePlan()
                                    },
                                    loading: isLoadingSubscribe
                                } : undefined}

                                secondaryFooterActions={isSubscribed ? [{
                                    content: 'Cancel Subscription',
                                    onAction: () => {
                                      cancelSubscription()
                                    },
                                    destructive: true,
                                    loading: isLoadingCancelSubscribe
                                  }
                                ] : []}
                            >
                                <DataTable
                                    columnContentTypes={[
                                        'text',
                                        'text',
                                        'text',
                                    ]}
                                    headings={[
                                        'Features',
                                        'Free version',
                                        planName,
                                    ]}
                                    rows={rows}
                                    increasedTableDensity
                                    hasZebraStripingOnData
                                    hoverable
                                />
                            </Card>
                        </div>
                    </Layout.Section>


                </Layout>
            </Page>
        </Frame >

    );
}



