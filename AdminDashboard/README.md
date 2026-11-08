# BiteRush admin demo

Open the regular sign-in page and select **Admin login**, or open `dashboard.html` directly. The login form and dashboard are a client-side demo and work with a static web server; no Node.js server setup is required.

The username and password check is performed in browser JavaScript, and the signed-in flag is stored in `localStorage`. This is not secure access control: anyone can inspect or change the page/script and bypass the check. Do not use this approach to protect real private data or a production admin dashboard.
