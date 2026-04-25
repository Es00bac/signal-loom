# General Agent Instructions

Welcome to the **Generative AI Flow Builder** workspace. This repository is a React + Vite + TypeScript application using React Flow (`@xyflow/react`) to build a generative AI media workflow tool.

## Operating Protocol
1. **Orientation:** Read `docs/HANDOFF.md`, `docs/TASK_LIST.md`, and the most recent file in `docs/notes/` to gain context.
2. **Task Execution:** Choose the next available task from `docs/TASK_LIST.md`. Do not start working on something that isn't on the list or requested by the user. If necessary, add to the task list before implementing.
3. **Documentation:** Write a summary of your work in a new Markdown file inside `docs/notes/` (e.g., `003-vertex-ai-integration.md`). Describe what was built, how the code is structured, and any caveats.
4. **Code Standards:**
   - Strict TypeScript.
   - Tailwind CSS or inline CSS modules (prioritize existing setup).
   - Use provided libraries (`openai`, `@google/generative-ai`, `@huggingface/inference`, `lucide-react`, `@ffmpeg/ffmpeg`).
   - Handle API keys securely (e.g., storing them only in browser local storage, never hardcoding them).
5. **UI Consistency:** The goal is a dark-themed, node-based workflow editor. Refer to the UI layout: a top navigation bar, a central React Flow canvas, and a floating bottom toolbar for adding nodes.

Thank you for contributing to the seamless multi-agent workflow!