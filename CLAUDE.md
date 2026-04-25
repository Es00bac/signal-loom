# Claude (Clod) Instructions

Welcome to the **Generative AI Flow Builder** project. This project aims to replicate the "ElevenLabs Flows" generative media tool, allowing users to visually link different AI models (image, video, text, music, audio, sound effect) in a graph interface.

## Your Role
You are responsible for picking up development where the previous agent left off. This project requires maintaining strict state in the form of a checklist and daily progress notes.

## Workflow Rules
1. **Read the Room:** Start your session by reading `docs/HANDOFF.md`, `docs/TASK_LIST.md`, and the latest note in `docs/notes/`.
2. **Update the Checklist:** Use the `docs/TASK_LIST.md` to track what you are working on. Mark items `[x]` when completed. If you add new features, add them to the checklist first.
3. **Take Notes:** For every major architectural decision or completed phase, create a new Markdown file in `docs/notes/` (e.g., `002-added-image-node.md`) detailing what you built, how it works, and how to use it.
4. **Code Quality:** Use TypeScript, `@xyflow/react`, and modern React functional components. Keep styling close to the dark-themed UI seen in the reference material (clean, rounded corners, icons).

## Key Features to Support
- **Providers:** Hugging Face, Gemini AI Studio, Google Vertex AI, OpenAI, ElevenLabs (optional).
- **Modularity:** Ensure nodes are easy to extend and create. Use a central store (like Zustand or Context) for API keys and global settings.
- **Visuals:** Dark mode by default, floating bottom toolbar, top nav bar.

## Next Steps
Check the task list and proceed to the next unchecked item!