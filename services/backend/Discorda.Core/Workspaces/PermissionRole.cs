namespace Discorda.Core.Workspaces;

[Flags]
public enum Permission : long
{
    None=0, ViewChannel=1, SendMessages=2, AttachFiles=4, AddReactions=8, CreateThreads=16,
    ManageMessages=32, ManageChannel=64, ManagePermissions=128, ConnectVoice=256,
    Speak=512, Camera=1024, ShareScreen=2048, ManageRoles=4096, ManageChannels=8192,
    ManageServer=16384, ModerateVoice=32768, ViewAudit=65536, Administrator=131072,
    All=262143,
    Default=ViewChannel|SendMessages|AttachFiles|AddReactions|CreateThreads|ConnectVoice|Speak|Camera|ShareScreen,
    Channel=ViewChannel|SendMessages|AttachFiles|AddReactions|CreateThreads|ManageMessages|ManageChannel|ManagePermissions|ConnectVoice|Speak|Camera|ShareScreen|ModerateVoice,
    Media=ConnectVoice|Speak|Camera|ShareScreen,
}

public sealed class PermissionRole
{
    public Guid Id {get;init;}=Guid.NewGuid();
    public Guid WorkspaceId {get;init;}
    public required string Name {get;set;}
    public string Color {get;set;}="#a6b2ff";
    public int Position {get;set;}=1;
    public bool IsEveryone {get;init;}
    public Permission Permissions {get;set;}
    public long Version {get;set;}=1;
}
public sealed class MemberPermissionRole
{
    public Guid RoleId {get;init;}
    public Guid UserId {get;init;}
}
public sealed class ChannelPermissionOverwrite
{
    public Guid Id {get;init;}=Guid.NewGuid();
    public Guid ChannelId {get;init;}
    public Guid? RoleId {get;init;}
    public Guid? UserId {get;init;}
    public Permission Allow {get;set;}
    public Permission Deny {get;set;}
    public long Version {get;set;}=1;
}

public static class PermissionRules
{
    public static Permission Resolve(Permission baseline, bool administrator, IEnumerable<ChannelPermissionOverwrite> everyone,
        IEnumerable<ChannelPermissionOverwrite> roles, IEnumerable<ChannelPermissionOverwrite> member)
    {
        if(administrator||(baseline&Permission.Administrator)!=0)return Permission.All;
        static Permission Apply(Permission current,IEnumerable<ChannelPermissionOverwrite> rules)
        {
            var allow=Permission.None;var deny=Permission.None;
            foreach(var rule in rules){allow|=rule.Allow;deny|=rule.Deny;}
            return (current&~deny)|allow;
        }
        var result=Apply(Apply(Apply(baseline,everyone),roles),member);
        if((result&Permission.ViewChannel)==0)result&=~Permission.Channel;
        if((result&Permission.ConnectVoice)==0)result&=~(Permission.Speak|Permission.Camera|Permission.ShareScreen);
        if((result&Permission.SendMessages)==0)result&=~(Permission.AttachFiles|Permission.CreateThreads);
        return result;
    }
}
