# AI Studio

A self-hosted, GitHub-backed AI development workspace.

## Status

Initial foundation in progress. The app is designed to run locally or on a Node.js host. OpenAI credentials stay on the server and are loaded from environment variables.

## Requirements

- Node.js 20+
- An OpenAI API key for AI-assisted coding

## Local development

1. Copy `.env.example` to `.env` and add your OpenAI API key.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open the local URL shown by Vite.

Never commit `.env` or API keys.

## Planned capabilities

- Project and file explorer
- Code editor
- AI coding chat with server-side model access
- Live preview and project runtime
- GitHub synchronization
- Export and deployment workflows

Some integrations require credentials and infrastructure configured by the owner.