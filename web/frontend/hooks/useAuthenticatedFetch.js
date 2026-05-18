export function useAuthenticatedFetch() {
  return async (uri, options) => {
    const response = await fetch(uri, options);
    checkHeadersForReauthorization(response.headers);
    return response;
  };
}

function checkHeadersForReauthorization(headers) {
  if (headers.get("X-Shopify-API-Request-Failure-Reauthorize") === "1") {
    const authUrlHeader =
      headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url") ||
      `/api/auth`;
    const destination = authUrlHeader.startsWith("/")
      ? `https://${window.location.host}${authUrlHeader}`
      : authUrlHeader;
    const currentParams = new URLSearchParams(window.location.search);
    const authUrl = new URL(destination);
    const host = currentParams.get("host");

    if (host && !authUrl.searchParams.get("host")) {
      authUrl.searchParams.set("host", host);
    }

    if (host) {
      const exitIframeUrl = new URL(
        `/exitiframe`,
        `https://${window.location.host}`
      );
      exitIframeUrl.searchParams.set("redirectUri", authUrl.toString());
      exitIframeUrl.searchParams.set("host", host);
      exitIframeUrl.searchParams.set(
        "shop",
        authUrl.searchParams.get("shop") || currentParams.get("shop") || ""
      );
      exitIframeUrl.searchParams.set("embedded", "1");
      window.open(exitIframeUrl.toString(), "_top");
      return;
    }

    window.open(authUrl.toString(), "_top");
  }
}
