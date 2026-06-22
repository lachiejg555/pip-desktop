# Get Pip as 3 downloadable apps (Windows, Mac, Linux)

You can't build Mac/Windows/Linux installers all on one computer easily — so this project uses **GitHub Actions**, a free service that builds all three for you on real machines in the cloud. You don't need a Mac or a PC or even Node installed. You click a few buttons and download the results.

## One-time setup (~10 minutes)

1. **Make a free GitHub account** at https://github.com if you don't have one.

2. **Create a new repository**: click the **+** (top right) → **New repository**. Name it `pip-desktop`, leave it Public (or Private — both work), click **Create repository**.

3. **Upload the project**: on the new repo's page, click **uploading an existing file** (the link in the quick-setup box). Drag in *everything* from the `pip-desktop` folder — including the hidden `.github` folder (it holds the build instructions). Then click **Commit changes**.
   - If your file explorer hides the `.github` folder: on Mac press Cmd+Shift+. to show hidden files; on Windows enable "Hidden items" in the View menu.

That's it for setup. The upload automatically kicks off the first build.

## Getting your 3 downloads

1. On your repo, click the **Actions** tab at the top.
2. You'll see a build running (yellow dot) or done (green check). Click into it. It takes ~3–5 minutes.
3. When it's green, scroll to the bottom to the **Artifacts** section. You'll see three downloads:
   - **pip-windows** → contains the `.exe` installer
   - **pip-mac** → contains the `.dmg`
   - **pip-linux** → contains the `.AppImage`
4. Click each to download. They come as `.zip` — unzip to get the actual installer.

To rebuild later (after changing anything): just upload the changed files again, or go to **Actions → Build Pip installers → Run workflow**.

## Important: these are UNSIGNED apps

Because they're not code-signed, when you or anyone runs them the OS shows a scary warning:

- **Windows**: a blue "Windows protected your PC" SmartScreen box → click **More info** → **Run anyway**.
- **Mac**: "Pip can't be opened because it's from an unidentified developer" → right-click the app → **Open** → **Open**, OR System Settings → Privacy & Security → **Open Anyway**.

This is fine for you and testers. To ship to real users *without* the warnings, you need code-signing certificates (Apple Developer Program ~$99/year; a Windows cert similar) and notarization — that's a separate setup step, and the workflow has a placeholder where those certificates plug in.

## Reminder of what the app does
Floating desktop pet you can drag (across monitors), that watches your screen and comments via Claude, and sends notifications. Add your Anthropic API key in the pet's ⚙ settings on first run. See the main README for details and the privacy controls.
