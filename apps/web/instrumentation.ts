
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log(
      "[web] Rate limiting & safety: Cache responses (Redis / in-memory); limit requests (e.g. 1 request per symbol per minute); never scrape on every page load."
    );
  }
}
