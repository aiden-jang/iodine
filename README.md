<p align="center">
  <img src="images/iodine_logo_2-preview.png" alt="Iodine" width="140" />
</p>

<h1 align="center">Iodine, Harness for Code Exploration</h1>

<p align="center">A harness built for exploring unfamiliar codebases. Understanding the architecture, tracing how things connect, and finding your way through the deep jungles of the code.</p>

<p align="center">
<a href="https://youtu.be/jy0Sb1kLzgo">Full Demo Part 1</a> · <a href="https://youtu.be/oifjOz1BLVk">Full Demo Part 2</a> · <a href="https://youtube.com/shorts/VeYM4Gd6_Pc?feature=share">Demo 1</a> · <a href="https://youtu.be/DFy1F0CQmN8">Demo 2</a> · <a href="https://www.youtube.com/watch?v=66pxz-CJ_sg">Demo 4</a> · <a href="https://youtu.be/DzGt5jQaSo8">Demo 5</a>
</p>

<img width="1279" height="689" alt="Iodine screenshot" src="https://github.com/user-attachments/assets/7fbbe29e-9f30-4b1f-8ab4-6e204e36e84d" />

## Installation

```bash
npm install -g iodine-ide
```

Requires Node.js 18+ and at least one AI provider API key (Anthropic, OpenAI, or Google).

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_TOKEN / GEMINI_API_KEY

iodine
```

On Windows (PowerShell), set the key permanently, then restart your terminal and run `iodine`:

```powershell
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "<your-key>", "User")   # or OPENAI_TOKEN / GEMINI_API_KEY
```

Anthropic keys are also auto-detected from `~/.anthropic/api_key` (on Windows: `%USERPROFILE%\.anthropic\api_key`).

Opens in your browser at http://localhost:3001. To use a different port: `PORT=4000 iodine`.

To update: `npm install -g iodine-ide@latest`.

## Features

- **Mentor mode** — guided walkthroughs that open files, highlight lines, and explain one block at a time without making changes
- **Live voice sessions** — real-time conversation via Gemini Live that reads files, navigates code, and drops a full transcript back into the chat
- **Polished documentation** — cached per-file and per-directory summaries with a Markdown preview and table-of-contents sidebar
- **System View** — interactive architecture graph generated from the codebase; nodes link back to source locations
- Supports Anthropic Claude, OpenAI GPT, and Google Gemini

## Running from source

```bash
git clone https://github.com/hyunwookshin/iodine.git
cd iodine
npm install
cp .env.example .env  # add your API keys
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

```bash
npm test           # run the test suite
npm run build      # production build
npm run typecheck  # TypeScript checks across the monorepo
```

For architecture details and contributor workflows, see [CONTRIBUTING.md](CONTRIBUTING.md).

