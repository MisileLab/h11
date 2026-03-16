using System.Collections.Generic;
using Godot;

namespace MegaCrit.Sts2.Core.Commands {
    public class CreatureCmd {
        public static void Damage(PlayerChoiceContext ctx, IEnumerable<Creature> targets, decimal amount, ValueProp prop, Creature? dealer, CardModel? cardSource) {}
    }
    public class PlayerChoiceContext {}
    public class Creature { public string Id { get; set; } = ""; public string Name { get; set; } = ""; }
    public class MonsterModel : Creature {}
    public struct ValueProp { public bool Unblockable; public bool Unpowered; }
    public class CardModel { public string Id { get; set; } = ""; public string Name { get; set; } = ""; }
    public class DamageResult { public decimal UnblockedDamage; public decimal BlockedDamage; public Creature Receiver = null!; }
}

namespace MegaCrit.Sts2.Core.Multiplayer {
    public class NetMessageBus { public static MultiplayerApi Multiplayer => new Godot.MultiplayerApi(); public static bool IsHost => true; }
}

namespace MegaCrit.Sts2.Core {
    public class RunState { public static int CurrentTurn; public static string LocalPlayerId = "p1"; }
}
