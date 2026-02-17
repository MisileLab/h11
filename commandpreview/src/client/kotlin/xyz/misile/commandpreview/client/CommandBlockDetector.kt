package xyz.misile.commandpreview.client

import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking
import net.minecraft.block.BlockState
import net.minecraft.block.Blocks
import net.minecraft.client.MinecraftClient
import net.minecraft.util.hit.BlockHitResult
import net.minecraft.util.hit.HitResult
import net.minecraft.util.math.BlockPos
import xyz.misile.commandpreview.network.CommandPreviewNetworking.CommandPreviewRequestPayload

object CommandBlockDetector {
    var currentTargetPos: BlockPos? = null
    var currentCommand: String? = null
    private val cache: MutableMap<BlockPos, Pair<String, Long>> = mutableMapOf()
    private var lastRequestPos: BlockPos? = null
    private var lastRequestTick: Long = 0

    private const val DEBOUNCE_TICKS = 10
    private const val CACHE_TTL_MS = 30_000L

    fun tick(client: MinecraftClient) {
        val world = client.world
        val player = client.player
        if (world == null || player == null) {
            currentTargetPos = null
            currentCommand = null
            return
        }

        clearExpiredCacheEntries()

        var targetPos: BlockPos? = null

        val hitResult = client.crosshairTarget
        if (hitResult is BlockHitResult && hitResult.type != HitResult.Type.MISS) {
            val crosshairPos = hitResult.blockPos
            if (isCommandBlock(world.getBlockState(crosshairPos))) {
                targetPos = crosshairPos
            }
        }

        if (targetPos == null) {
            val belowPos = player.blockPos.down()
            if (isCommandBlock(world.getBlockState(belowPos))) {
                targetPos = belowPos
            }
        }

        if (targetPos == null) {
            currentTargetPos = null
            currentCommand = null
            return
        }

        currentTargetPos = targetPos

        val cached = cache[targetPos]
         if (cached != null) {
             val (command, timestamp) = cached
             if (command.isEmpty() || System.currentTimeMillis() - timestamp > CACHE_TTL_MS) {
                 cache.remove(targetPos)
             } else {
                 currentCommand = command
                 return
             }
         }

        currentCommand = null

        val currentTick = world.time
        val shouldRequest = lastRequestPos != targetPos || currentTick - lastRequestTick >= DEBOUNCE_TICKS
        if (shouldRequest) {
            ClientPlayNetworking.send(CommandPreviewRequestPayload(targetPos))
            lastRequestPos = targetPos
            lastRequestTick = currentTick
        }
    }

    fun isCommandBlock(state: BlockState): Boolean {
        return state.isOf(Blocks.COMMAND_BLOCK) ||
            state.isOf(Blocks.CHAIN_COMMAND_BLOCK) ||
            state.isOf(Blocks.REPEATING_COMMAND_BLOCK)
    }

    fun handleResponse(pos: BlockPos, command: String) {
         if (command.isEmpty()) {
             cache.remove(pos)
             if (pos == currentTargetPos) {
                 currentCommand = null
             }
         } else {
             cache[pos] = Pair(command, System.currentTimeMillis())
             if (pos == currentTargetPos) {
                 currentCommand = command
             }
         }
     }

    private fun clearExpiredCacheEntries() {
        val now = System.currentTimeMillis()
        cache.entries.removeIf { now - it.value.second > CACHE_TTL_MS }
    }
}
