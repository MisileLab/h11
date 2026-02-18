<!-- Parent: ../AGENTS.md -->
# COMMANDPREVIEW

## OVERVIEW
Minecraft Fabric mod (client-side): previews command block output. Kotlin + Gradle + fabric-loom.

## STRUCTURE
```
commandpreview/
├── src/
│   ├── client/kotlin/xyz/misile/commandpreview/client/
│   │   ├── CommandpreviewClient.kt      # Mod entrypoint
│   │   ├── CommandBlockDetector.kt      # Block detection logic (104 lines)
│   │   ├── CommandPreviewHud.kt         # HUD rendering
│   │   └── CommandpreviewDataGenerator.kt
│   └── main/resources/                  # fabric.mod.json, assets
├── build.gradle.kts   # Kotlin 2.3, fabric-loom 1.15, Java 21
├── gradle.properties  # MC 1.21.11, Fabric versions
└── run/               # Dev runtime (gitignored saves/logs)
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Mod entry | `src/client/.../CommandpreviewClient.kt` | Client-side entrypoint |
| Core logic | `src/client/.../CommandBlockDetector.kt` | Command block detection |
| HUD render | `src/client/.../CommandPreviewHud.kt` | In-game overlay |
| Versions | `gradle.properties` | MC version, Fabric loader, Kotlin |
| Build config | `build.gradle.kts` | Loom, dependencies, publishing |

## CONVENTIONS
- Client-side only mod; uses `splitEnvironmentSourceSets()` (loom).
- Kotlin 2.3.10 + Java 21 target.
- Yarn mappings (Fabric), not Mojang mappings.
- `run/` directory is for local dev runtime; never commit its contents.

## COMMANDS
```bash
./gradlew build       # Build mod JAR
./gradlew runClient   # Launch Minecraft with mod
```
