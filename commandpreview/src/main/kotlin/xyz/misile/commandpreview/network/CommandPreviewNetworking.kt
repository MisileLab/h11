package xyz.misile.commandpreview.network

import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking
import net.minecraft.block.entity.CommandBlockBlockEntity
import net.minecraft.command.permission.Permission
import net.minecraft.command.permission.PermissionLevel
import net.minecraft.network.RegistryByteBuf
import net.minecraft.network.codec.PacketCodec
import net.minecraft.network.codec.PacketCodecs
import net.minecraft.network.packet.CustomPayload
import net.minecraft.util.Identifier
import net.minecraft.util.math.BlockPos

object CommandPreviewNetworking {
    // Request payload (Client -> Server)
    data class CommandPreviewRequestPayload(val pos: BlockPos) : CustomPayload {
        companion object {
            val ID: CustomPayload.Id<CommandPreviewRequestPayload> = CustomPayload.Id(
                Identifier.of("commandpreview", "request")
            )
            val CODEC: PacketCodec<RegistryByteBuf, CommandPreviewRequestPayload> = object : PacketCodec<RegistryByteBuf, CommandPreviewRequestPayload> {
                override fun encode(buf: RegistryByteBuf, payload: CommandPreviewRequestPayload) {
                    PacketCodecs.VAR_INT.encode(buf, payload.pos.x)
                    PacketCodecs.VAR_INT.encode(buf, payload.pos.y)
                    PacketCodecs.VAR_INT.encode(buf, payload.pos.z)
                }

                override fun decode(buf: RegistryByteBuf): CommandPreviewRequestPayload {
                    val x = PacketCodecs.VAR_INT.decode(buf)
                    val y = PacketCodecs.VAR_INT.decode(buf)
                    val z = PacketCodecs.VAR_INT.decode(buf)
                    return CommandPreviewRequestPayload(BlockPos(x, y, z))
                }
            }
        }

        override fun getId(): CustomPayload.Id<out CustomPayload> = ID
    }

    // Response payload (Server -> Client)
    data class CommandPreviewResponsePayload(val pos: BlockPos, val command: String) : CustomPayload {
        companion object {
            val ID: CustomPayload.Id<CommandPreviewResponsePayload> = CustomPayload.Id(
                Identifier.of("commandpreview", "response")
            )
            val CODEC: PacketCodec<RegistryByteBuf, CommandPreviewResponsePayload> = object : PacketCodec<RegistryByteBuf, CommandPreviewResponsePayload> {
                override fun encode(buf: RegistryByteBuf, payload: CommandPreviewResponsePayload) {
                    PacketCodecs.VAR_INT.encode(buf, payload.pos.x)
                    PacketCodecs.VAR_INT.encode(buf, payload.pos.y)
                    PacketCodecs.VAR_INT.encode(buf, payload.pos.z)
                    PacketCodecs.STRING.encode(buf, payload.command)
                }

                override fun decode(buf: RegistryByteBuf): CommandPreviewResponsePayload {
                    val x = PacketCodecs.VAR_INT.decode(buf)
                    val y = PacketCodecs.VAR_INT.decode(buf)
                    val z = PacketCodecs.VAR_INT.decode(buf)
                    val cmd = PacketCodecs.STRING.decode(buf)
                    return CommandPreviewResponsePayload(BlockPos(x, y, z), cmd)
                }
            }
        }

        override fun getId(): CustomPayload.Id<out CustomPayload> = ID
    }

    fun registerPayloadTypes() {
        PayloadTypeRegistry.playC2S().register(CommandPreviewRequestPayload.ID, CommandPreviewRequestPayload.CODEC)
        PayloadTypeRegistry.playS2C().register(CommandPreviewResponsePayload.ID, CommandPreviewResponsePayload.CODEC)
    }

    fun registerServerHandler() {
        ServerPlayNetworking.registerGlobalReceiver(CommandPreviewRequestPayload.ID) { payload, context ->
            val player = context.player()
            if (!player.permissions.hasPermission(Permission.Level(PermissionLevel.GAMEMASTERS))) return@registerGlobalReceiver

            val blockEntity = player.entityWorld.getBlockEntity(payload.pos)
            if (blockEntity !is CommandBlockBlockEntity) return@registerGlobalReceiver

            val command = blockEntity.commandExecutor.command
            ServerPlayNetworking.send(player, CommandPreviewResponsePayload(payload.pos, command))
        }
    }
}
