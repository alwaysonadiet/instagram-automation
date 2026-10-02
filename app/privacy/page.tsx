export default function PrivacyPage() {
 return <main className="max-w-2xl mx-auto py-12 px-4 space-y-6">
  <h1 className="text-3xl font-bold">Privacy Policy — LadyNomad DM Automation</h1>
  <p>Last updated: 2 October 2026</p>
  <p>LadyNomad operates this application to manage its authorised Instagram account, conversations and comment replies. Contact: <a className="underline" href="mailto:ladynomad.official@gmail.com">ladynomad.official@gmail.com</a>.</p>
  <h2 className="text-xl font-semibold">Information processed</h2>
  <p>We process Instagram account identifiers, usernames, profile details, access tokens, messages, comments, sender identifiers, media information and automation settings needed for the features in use. Technical logs may contain event details needed to diagnose delivery problems.</p>
  <h2 className="text-xl font-semibold">Purpose and service providers</h2>
  <p>We use this information to display conversations, receive account events, send configured replies and protect and troubleshoot the application. Vercel hosts the application, Supabase provides database, authentication and realtime services, and Meta provides the Instagram API. Data may be processed in the locations used by these providers. If the account operator enables AI replies, message content and configured business context are sent to Groq for that feature. AI replies are optional.</p>
  <h2 className="text-xl font-semibold">Access and retention</h2>
  <p>Account data is restricted to the authorised account operator and the services needed to run the application. We do not sell Instagram data. Stored account and conversation data is retained while needed for this application, unless deletion is requested. Provider logs and backups may remain for their retention periods. Logging out ends the browser session; it does not delete stored account data.</p>
  <h2 className="text-xl font-semibold">Your choices and requests</h2>
  <p>You can revoke this app’s access through Instagram’s Apps and websites settings. To request access, correction or deletion of information held by this application, email the contact above. We may verify your connection to the account before acting on a request. Please do not send passwords or access tokens.</p>
  <p><a className="underline" href="/data-deletion">Data deletion instructions</a> · <a className="underline" href="/terms">Terms of use</a></p>
 </main>
}
