# Settings

The Settings modal controls how Sloom Studio behaves across all workspaces. It stores API keys, default models, interface preferences, input bindings, brush presets, and license information. Settings are saved per user profile and persist between sessions. Some settings can be overridden per project.

Open Settings with **File > Preferences** or the shortcut `Ctrl+,` (Windows/Linux) and `Cmd+,` (macOS). The modal is organized into tabs: Providers, Defaults, Interface, Keyboard, Gamepad, Brushes, License, Backup, and OSS Licenses.

## Providers and API Keys

The Providers tab is where you enter credentials for AI and media services. API keys are stored locally, usually in browser local storage or the Electron secure store, depending on the platform. They are never sent to Sloom Studio's own servers; they are used only to call the providers you choose.

Supported provider key fields include:

| Provider | Key Name | Used For |
|----------|----------|----------|
| OpenAI | `openai` | GPT text models, DALL·E image generation |
| Google Gemini | `gemini` | Gemini text and image models, Vertex layout |
| Hugging Face | `huggingface` | Hugging Face inference endpoints |
| ElevenLabs | `elevenlabs` | Text-to-speech and narration |
| Black Forest Labs | `bfl` | Flux image generation |
| Stability AI | `stability` | Stable image and video generation |
| Atlas | `atlas` | Atlas media services |
| BytePlus | `byteplus` | BytePlus media services |

Enter each key in its field and click **Save**. A small indicator shows whether the key is present. To remove a key, clear the field and save.

### Security Notes

- Do not share your settings backup file if it contains API keys.
- On shared machines, use the native build so keys are stored in the OS keychain when possible.
- Browser builds may store keys in local storage; clear them if you sign out or share the browser profile.

## Default Models

The Defaults tab lets you choose the default model for each type of operation:

- **Text generation** — Default LLM for text nodes and story tools.
- **Image generation** — Default model for image generation nodes.
- **Video generation** — Default model for video generation nodes.
- **Audio generation** — Default model for audio and narration nodes.

Defaults are used when a node does not explicitly specify a model. You can override the default in any node's inspector.

## Vertex Auth

The Vertex Auth panel configures Google Cloud Vertex AI authentication. Vertex AI is used for Gemini layout, some image models, and enterprise deployments.

Three authentication methods are supported:

1. **gcloud CLI** — Use an existing gcloud login on your machine. Sloom Studio invokes `gcloud auth print-access-token` to obtain tokens.
2. **Application Default Credentials (ADC)** — Uses the standard ADC path, usually a service account JSON set via the `GOOGLE_APPLICATION_CREDENTIALS` environment variable.
3. **Service Account JSON** — Paste or upload a service account key file. The key is stored securely and used to request access tokens.

Choose the method that matches your organization's security policy. Vertex authentication is required only if you use Vertex-specific providers or features.

## Provider-Specific Endpoints and Options

Some providers allow custom endpoints and options. In the Providers tab, expand the provider card to reveal:

- **Base URL / Endpoint** — Override the default API endpoint. Useful for proxies, on-premise deployments, or OpenAI-compatible services.
- **Organization ID** — For providers that require an organization header.
- **Timeout** — Maximum time to wait for a response.
- **Retry Count** — How many times to retry failed requests.
- **Batch Size** — How many items to send in a single batch request.
- **Local Endpoint** — For local inference servers such as Ollama or vLLM.
- **Android Accelerator** — Enable hardware acceleration on Android builds when supported.
- **Render Backend** — Choose CPU, WebGL, or native rendering for provider previews.

These options cascade: project-level settings override user defaults, and node-level settings override project defaults.

## Interface Themes and Density

The Interface tab controls the visual appearance of Sloom Studio.

### Themes

Sloom Studio supports multiple interface themes. The default is a dark theme designed for long media editing sessions. Available themes may include:

- Dark (default)
- Dark High Contrast
- Light
- Light High Contrast
- System (follows OS setting)

### Density

Density affects how compact the UI is:

- **Comfortable** — Larger padding, easier touch targets.
- **Compact** — More information visible at once, preferred for large monitors.
- **Minimal** — Hides secondary labels and reduces chrome.

Density also affects Source Bin thumbnails, timeline track heights, and panel spacing.

## App Menu Style

Choose between:

- **Compact** — Single menu button in the top navbar.
- **Menubar** — Traditional menu bar, integrated with the OS on macOS.

Changing this setting takes effect immediately.

## Language and Locale

The Language / Locale setting controls:

- Interface language.
- Date, time, and number formatting.
- Default Paper typography and binding direction.
- Available font presets and spell-check behavior.

Changing the language does not affect existing document content, only UI labels and defaults for new documents.

## Keyboard Shortcuts

The Keyboard tab lists every command and its shortcut. You can:

- Search for a command.
- View the current binding.
- Reset a shortcut to default.
- Export the shortcut list.

Some shortcuts are global and work from any workspace. Others are workspace-specific and only work when that workspace is active. Conflicts are highlighted in red.

## Gamepad Bindings

The Gamepad tab lets you assign gamepad buttons and axes to commands. For each command you can set:

- Button press
- Button hold
- Axis direction
- Modifier combination

Gamepad bindings are saved separately from keyboard shortcuts. You can enable or disable gamepad input entirely from this tab.

## Brush and Crop Presets

The Brushes tab stores custom brush and crop presets used in the Image Editor and Paper workspace.

For brushes you can define:

- Size, hardness, opacity, and flow.
- Dynamics: pressure, tilt, velocity, jitter.
- Texture and scatter.
- Blend mode.

For crops you can define:
- Aspect ratio.
- Fixed dimensions.
- Resolution and DPI.
- Bleed and safe margins.

Presets can be exported and imported for sharing between projects or users.

## License

The License tab shows your current license status:

- **Community** — Free mode, feature reminders may appear.
- **Commercial** — Paid mode, all features unlocked.

To activate a Commercial license:

1. Purchase a license key from the Sloom Studio website or authorized reseller.
2. Open **Settings > License**.
3. Enter the license key.
4. Click **Activate**.

License verification uses offline Ed25519 signatures. The app validates the key locally without phoning home on every launch, although an initial internet connection may be needed to download the public key bundle.

### Commercial Export Gating

Some export formats and high-volume operations are gated behind Commercial status. If you attempt a gated export in Community mode, the export dialog will explain the restriction and offer an upgrade path.

## Settings Backup and Restore

Sloom Studio can export your settings to a JSON file. This is useful for:

- Migrating to a new machine.
- Sharing provider configurations within a team.
- Recovering from a corrupted profile.

To back up:

1. Open **Settings**.
2. Go to the Backup tab.
3. Click **Export Settings**.
4. Choose a safe location for the JSON file.

To restore:

1. Go to the Backup tab.
2. Click **Import Settings**.
3. Select the JSON file.
4. Confirm which categories to restore: providers, interface, shortcuts, gamepad, brushes, license.

**Warning:** Backup files may contain API keys and license information. Store them securely and do not share them.

## OSS Licenses

The OSS Licenses section lists the open-source software used by Sloom Studio, including React, Vite, TypeScript, React Flow, FFmpeg, Lucide icons, and many others. Each entry shows:

- Library name and version.
- License type.
- A link to the full license text.

This section is provided for compliance and transparency. If you redistribute Sloom Studio or build on its code, review the license obligations carefully.

## Settings Cascade

Settings are resolved in this order, from lowest to highest priority:

1. Application defaults.
2. User settings from the Settings modal.
3. Project settings stored in the `.sloom` file.
4. Node or asset-level overrides.

When a setting can be overridden at a lower level, the UI usually shows a small link or icon indicating that a default is being used.

## Troubleshooting Settings

| Problem | Solution |
|---------|----------|
| API key not saved | Check that you clicked **Save**. On browser builds, ensure local storage is not disabled. |
| Provider says unauthorized | Verify the key, endpoint, and organization ID. Check the Usage Bar for provider-specific errors. |
| Language did not change | Restart Sloom Studio after changing language if some labels remain in the previous language. |
| Shortcuts conflict | Open **Settings > Keyboard** and resolve conflicts highlighted in red. |
| License activation fails | Ensure the key is complete and your clock is correct. Contact support if the key is rejected offline. |

For more about settings-related workflows, see the workspace-specific chapters.
