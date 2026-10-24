// Read-only application diagnostic. Never prints credentials or callback tokens.
try {
  const auth = await fetch("https://api.bandwidth.com/api/v1/oauth2/token", {
    method: "POST", headers: {
      Authorization: "Basic " + Buffer.from(process.env.BANDWIDTH_CLIENT_ID + ":" + process.env.BANDWIDTH_CLIENT_SECRET).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(10000),
  });
  console.log("OAuth HTTP", auth.status);
  if (!auth.ok) process.exitCode = 1;
  else {
    const { access_token } = await auth.json();
    const response = await fetch("https://api.bandwidth.com/api/accounts/" + encodeURIComponent(process.env.BANDWIDTH_ACCOUNT_ID) +
      "/applications/" + encodeURIComponent(process.env.BANDWIDTH_APPLICATION_ID), {
      headers: { Authorization: "Bearer " + access_token }, signal: AbortSignal.timeout(10000),
    });
    console.log("Read application HTTP", response.status);
    if (response.ok) {
      const body = await response.text();
      console.log("Name is default-messaging:", body.includes("default-messaging"));
      for (const match of body.matchAll(/https?:[^\s<>"\\]+/g)) {
        try {
          const url = new URL(match[0].replaceAll("&amp;", "&"));
          const preceding = body.slice(Math.max(0, match.index - 100), match.index);
          const field = preceding.match(/([A-Za-z][A-Za-z0-9]*)[>"\s:]+$/)?.[1] || "callback";
          console.log(JSON.stringify({ field, callback: url.origin + url.pathname,
            tokenMatches: url.searchParams.get("token") === process.env.BANDWIDTH_WEBHOOK_TOKEN }));
        } catch { /* No raw output for unparseable URLs. */ }
      }
    }
  }
} catch {
  console.error("Read-only diagnostic failed; network access or timeout. No secrets printed.");
  process.exitCode = 1;
}
