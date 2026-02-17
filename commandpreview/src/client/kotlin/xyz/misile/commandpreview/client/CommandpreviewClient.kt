package xyz.misile.commandpreview.client

import net.fabricmc.api.ClientModInitializer
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback
import xyz.misile.commandpreview.network.CommandPreviewNetworking.CommandPreviewResponsePayload

class CommandpreviewClient : ClientModInitializer {

    override fun onInitializeClient() {
        HudRenderCallback.EVENT.register(CommandPreviewHud::render)

        ClientTickEvents.END_CLIENT_TICK.register(CommandBlockDetector::tick)

        ClientPlayNetworking.registerGlobalReceiver(CommandPreviewResponsePayload.ID) { payload, context ->
            context.client().execute {
                CommandBlockDetector.handleResponse(payload.pos, payload.command)
            }
        }
    }
}
