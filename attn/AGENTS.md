<!-- Parent: ../AGENTS.md -->
# ATTN

## OVERVIEW
Unity project with gameplay scripts, scenes, and project settings.

## STRUCTURE
```
attn/
├── Assets/           # Gameplay code, scenes, materials
├── Packages/         # Unity Package Manager manifests
├── ProjectSettings/  # Unity project configuration
└── Library/          # Generated Unity cache (do not edit)
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Gameplay scripts | `Assets/Scripts` | C# gameplay logic |
| Scenes | `Assets/Scenes` | Unity scene files |
| Project version | `ProjectSettings/ProjectVersion.txt` | Unity 6000.3.4f1 |
| Package deps | `Packages/manifest.json` | Unity Package Manager |

## CONVENTIONS
- Uses Unity Package Manager with URP 17.3.0 and `com.coplaydev.unity-mcp`.
- Project settings live under `ProjectSettings/` and are YAML/JSON assets.

## ANTI-PATTERNS
- Do not edit or commit generated directories: `Library`, `Logs`, `UserSettings`.
