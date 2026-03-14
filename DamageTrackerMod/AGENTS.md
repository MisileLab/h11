<!-- Parent: ../AGENTS.md -->
# DAMAGETRACKER MOD

## OVERVIEW
Slay the Spire 2 mod: damage tracking overlay via Harmony hooks, Godot 5 integration.

## STRUCTURE
```
DamageTrackerMod/
├── src/
│   ├── ModEntry.cs      # Mod lifecycle (ISts2Mod)
│   ├── Hooks/           # Harmony patches
│   ├── UI/              # Overlay rendering
│   ├── Data/            # Damage models
│   └── Network/         # Multiplayer sync
├── DamageTrackerMod.csproj
└── obj/                 # Build artifacts
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Mod entry | `src/ModEntry.cs` | Initialize, shutdown hooks |
| Harmony patches | `src/Hooks/` | Runtime method patching |
| Overlay UI | `src/UI/` | Godot rendering |
| Data models | `src/Data/` | Damage tracking state |
| Build config | `DamageTrackerMod.csproj` | .NET 9, GodotSharp refs |

## CONVENTIONS
- .NET 9.0, C# 13 (latest).
- Nullable enabled, implicit usings.
- HarmonyX v2.10.2 for runtime patching.
- Builds with stubs if Godot SDK missing (`DAMAGE_TRACKER_STUBS`).

## COMMANDS
```bash
dotnet build                # Build mod DLL
dotnet clean                # Clean artifacts
```

## NOTES
- Requires Godot 5 SDK for full build.
- CI builds use stub DLLs (conditional compilation).
- No test framework configured.
