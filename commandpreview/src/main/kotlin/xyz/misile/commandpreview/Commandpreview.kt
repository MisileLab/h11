package xyz.misile.commandpreview

import net.fabricmc.api.ModInitializer
import xyz.misile.commandpreview.network.CommandPreviewNetworking

class Commandpreview : ModInitializer {
    override fun onInitialize() {
        CommandPreviewNetworking.registerPayloadTypes()
        CommandPreviewNetworking.registerServerHandler()
    }
}
