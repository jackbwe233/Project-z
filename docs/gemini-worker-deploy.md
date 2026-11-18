# Deploy Project Z Gemini gateway

The **Gemini chat upgrade is NOT ready to merge** while `/health` still returns `Hello World!`.

## Cloudflare Worker update

1. In Cloudflare Dashboard → **Workers & Pages**, open the existing `project-z-brain` Worker.
2. Edit its deployed script using the content of [project-z-brain.worker.mjs](../cloudflare/project-z-brain.worker.mjs). Replace starter/Hello World code and click **Deploy**.
3. Under **Settings → Variables and Secrets**, verify both encrypted **secrets** are present:
   - `GEMINI_API_KEY`: a working Google Gemini API key (never paste into GitHub).
   - `Z_ACCESS_TOKEN`: a strong random token (different from the API key); only you should know it.
4. Visit `https://project-z-brain.mcrkw49n9c.workers.dev/health`. Expected response:
   `{"ok":true,"service":"Project Z Brain"}`
   **Not** `Hello World!`.
5. Check the pull request's GitHub Actions status. The smoke test verifies health, allowed-origin CORS, rejection of invalid tokens and forbidden origins. These tests do **not** incur Gemini requests.
6. **Before merging**, use a private deployed test page/browser and manually enter the `Z_ACCESS_TOKEN` to send a message. Successful Gemini inference is not covered by the unauthenticated CI smoke test. Verify the real iPhone Safari flow as well.

The public GitHub Pages app will use the address `https://jackbwe233.github.io/Project-z/gemini-chat.html` **after merging**. The separate beta page doesn't change the local WebLLM model.

## Security / troubleshooting

- No secrets belong in GitHub, JavaScript HTML, screenshots or shared chat.
- A Worker that says `Hello World!` has not been replaced with the API gateway.
- `503` from `/chat` after deployment means required secrets are missing.
- `401` means the access token was absent or invalid.
- `403` often means the request did not originate from `https://jackbwe233.github.io`.
- `429` is Gemini rate limiting. A free tier may have quotas and is not guaranteed; keep the Worker access token private and monitor usage.
- The Worker forwards chat text to Google Gemini. Don't send sensitive information until you accept that cloud processing.
- To test only the Worker without secrets: `node scripts/test-gemini-worker.mjs`.
