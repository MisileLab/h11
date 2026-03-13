#if !DAMAGE_TRACKER_STUBS

namespace HarmonyLib;

using System.Reflection;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public class HarmonyPatchAttribute : Attribute
{
    public Type? declaringType { get; set; }
    public string? methodName { get; set; }
    public Type[]? argumentTypes { get; set; }
    public string[]? argumentNames { get; set; }

    public HarmonyPatchAttribute() { }
    public HarmonyPatchAttribute(Type declaringType) { this.declaringType = declaringType; }
    public HarmonyPatchAttribute(Type declaringType, string methodName) { this.declaringType = declaringType; this.methodName = methodName; }
    public HarmonyPatchAttribute(string methodName) { this.methodName = methodName; }
}

[AttributeUsage(AttributeTargets.Method)]
public class HarmonyPrefixAttribute : Attribute
{
    public int priority { get; set; } = 0;
}

[AttributeUsage(AttributeTargets.Method)]
public class HarmonyPostfixAttribute : Attribute
{
    public int priority { get; set; } = 0;
}

[AttributeUsage(AttributeTargets.Method)]
public class HarmonyTranspilerAttribute : Attribute { }

[AttributeUsage(AttributeTargets.Method)]
public class HarmonyFinalizerAttribute : Attribute { }

public class Harmony
{
    public Harmony(string id) { }
    public void PatchAll(Assembly assembly) { }
    public void UnpatchAll(string id) { }
}

public static class AccessTools
{
    public static Type? TypeByName(string name) => null;
    public static MethodInfo? Method(Type type, string name) => null;
    public static MethodInfo? Method(Type type, string name, Type[]? parameters = null) => null;
    public static FieldInfo? Field(Type type, string name) => null;
    public static PropertyInfo? Property(Type type, string name) => null;
    public static MethodInfo? GetDeclaredMethod(Type type, string name) => null;
}

#endif
