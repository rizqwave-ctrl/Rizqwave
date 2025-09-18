Post-deploy verification checklist

1) Ensure functions config or env vars are set:
   - Using firebase functions config:
     firebase functions:config:set smtp.host="smtp.sendgrid.net" smtp.port="587" smtp.user="apikey" smtp.pass="YOUR_SENDGRID_API_KEY" smtp.from="noreply@yourdomain.com"
   - Or set environment variables in your host.

2) Install functions dependencies and deploy:
   cd functions
   npm install
   cd ..
   firebase deploy --only functions,hosting

3) Run a quick test:
   - Open the site, sign up with a reachable email.
   - Verify you are redirected to /verify.html with the email shown.
   - Enter the code from your email and click Verify.
   - On success, sign-in and confirm the app loads.

4) Troubleshooting:
   - Check function logs: firebase functions:log --only sendVerification
   - If emails not delivered, confirm SMTP creds and try using SendGrid SMTP (user=apikey, pass=<sendgrid_api_key>).

5) Optional: Auto-login after verification
   - If you want the user to be signed-in immediately after verifying, I can implement issuing a Firebase custom token in the verify endpoint and return it to the client to sign in automatically (requires additional secure server-side code).
