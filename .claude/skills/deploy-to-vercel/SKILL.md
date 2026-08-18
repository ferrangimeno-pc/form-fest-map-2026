---
name: deploy-to-vercel
description: Deploy the FORM Fest map (this project) to Vercel via GitHub by staging all changes, committing with a generated summary, and pushing to origin master. Use when the user invokes `/deploy-to-vercel` or asks to deploy, ship, or push the FORM Fest map live. Only valid in this project — it auto-deploys https://form-fest-map-2026.vercel.app/.
---

# Deploy to Vercel

Deploy the current project to Vercel via GitHub by staging all changes, committing with a brief summary, and pushing to origin master.

## Steps

1. Run `git diff --stat HEAD` and `git status --short` to understand what changed
2. Based on the diff, write a brief one-line commit message (max 60 chars) that summarizes the changes — be specific, e.g. "Update fog density and fix modal scroll" not "Various changes"
3. Run:
   ```
   git add .
   git commit -m "<your generated message>"
   git push origin master
   ```
4. Report back:
   - The commit message used
   - How many files changed
   - Confirm push succeeded
   - Remind the user that Vercel will auto-deploy in ~60 seconds at https://form-fest-map-2026.vercel.app/

## Rules
- Never ask the user what the commit message should be — generate it yourself from the diff
- Keep the message brief and factual
- Do not use `git add -A` — use `git add .` to respect .gitignore
- If there is nothing to commit, say so clearly instead of failing silently
