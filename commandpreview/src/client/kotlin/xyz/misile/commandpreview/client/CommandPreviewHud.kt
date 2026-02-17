package xyz.misile.commandpreview.client

import net.minecraft.client.gui.DrawContext
import net.minecraft.client.render.RenderTickCounter

object CommandPreviewHud {
    private const val MAX_DISPLAY_WIDTH_PERCENT = 0.8f
    private const val PADDING = 4
    private const val Y_OFFSET_FROM_BOTTOM = 60
    private const val BG_COLOR = 0x80000000
    private const val TEXT_COLOR = 0xFFFFFFFF
    private const val ELLIPSIS = "..."

    fun render(drawContext: DrawContext, tickCounter: RenderTickCounter) {
        if (CommandBlockDetector.currentCommand == null) {
            return
        }

        if (CommandBlockDetector.currentTargetPos == null) {
            return
        }

        val command = CommandBlockDetector.currentCommand ?: return
        val normalized = normalizeCommand(command)

        if (normalized.isEmpty()) {
            return
        }

        val client = net.minecraft.client.MinecraftClient.getInstance()
        val textRenderer = client.textRenderer

        val screenWidth = drawContext.scaledWindowWidth
        val screenHeight = drawContext.scaledWindowHeight

        val maxAvailableWidth = (screenWidth * MAX_DISPLAY_WIDTH_PERCENT).toInt()
        val displayText = truncateToPixelWidth(normalized, textRenderer, maxAvailableWidth)

        val textWidth = textRenderer.getWidth(displayText)
        val x = (screenWidth - textWidth) / 2
        val y = screenHeight - Y_OFFSET_FROM_BOTTOM

        drawContext.fill(x - PADDING, y - PADDING, x + textWidth + PADDING, y + 12, BG_COLOR.toInt())
        drawContext.drawText(textRenderer, displayText, x, y, TEXT_COLOR.toInt(), true)
    }

    private fun normalizeCommand(input: String): String {
        return input
            .replace(Regex("[\\r\\n\\t\\u0000-\\u001F]"), " ")
            .replace(Regex(" +"), " ")
            .trim()
    }

    private fun truncateToPixelWidth(text: String, textRenderer: net.minecraft.client.font.TextRenderer, maxWidth: Int): String {
        if (textRenderer.getWidth(text) <= maxWidth) {
            return text
        }

        val ellipsisWidth = textRenderer.getWidth(ELLIPSIS)
        val availableWidth = maxWidth - ellipsisWidth
        if (availableWidth <= 0) {
            return ELLIPSIS
        }

        var truncated = text
        while (textRenderer.getWidth(truncated) > availableWidth && truncated.isNotEmpty()) {
            truncated = truncated.dropLast(1)
        }

        return truncated + ELLIPSIS
    }
}
