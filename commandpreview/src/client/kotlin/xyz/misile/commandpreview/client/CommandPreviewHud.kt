package xyz.misile.commandpreview.client

import net.minecraft.client.gui.DrawContext
import net.minecraft.client.render.RenderTickCounter

object CommandPreviewHud {
    fun render(drawContext: DrawContext, tickCounter: RenderTickCounter) {
        // Early return if no command is available
        if (CommandBlockDetector.currentCommand == null) {
            return
        }

        // Early return if no target position is set
        if (CommandBlockDetector.currentTargetPos == null) {
            return
        }

        val command = CommandBlockDetector.currentCommand ?: return
        
        // Truncate command to 80 characters if needed
        val displayText = if (command.length > 80) {
            command.substring(0, 77) + "..."
        } else {
            command
        }

        // Get window dimensions
        val screenWidth = drawContext.scaledWindowWidth
        val screenHeight = drawContext.scaledWindowHeight

        // Get text renderer from client
        val client = net.minecraft.client.MinecraftClient.getInstance()
        val textRenderer = client.textRenderer

        // Calculate text width for centering
        val textWidth = textRenderer.getWidth(displayText)

        // Position: centered horizontally, above hotbar
        val x = (screenWidth - textWidth) / 2
        val y = screenHeight - 60

        // Draw semi-transparent black background
        drawContext.fill(x - 4, y - 4, x + textWidth + 4, y + 12, 0x80000000.toInt())

        // Draw white text with shadow
        drawContext.drawText(textRenderer, displayText, x, y, 0xFFFFFF, true)
    }
}
