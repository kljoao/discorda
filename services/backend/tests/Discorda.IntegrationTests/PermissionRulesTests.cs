using Discorda.Core.Workspaces;

namespace Discorda.IntegrationTests;

public sealed class PermissionRulesTests
{
    private static ChannelPermissionOverwrite Rule(Permission allow=Permission.None,Permission deny=Permission.None)=>new(){ChannelId=Guid.NewGuid(),Allow=allow,Deny=deny};
    [Fact] public void EveryoneDenyCanBeOpenedByAnAllowedRoleThenDeniedForOnePerson()
    {
        var everyone=new[]{Rule(deny:Permission.ViewChannel)};var roles=new[]{Rule(allow:Permission.ViewChannel)};
        Assert.Equal(Permission.Default,PermissionRules.Resolve(Permission.Default,false,everyone,roles,[]));
        Assert.Equal(Permission.None,PermissionRules.Resolve(Permission.Default,false,everyone,roles,[Rule(deny:Permission.ViewChannel)]));
    }
    [Fact] public void RoleAllowsCombineAndIndividualOverrideIsLast()
    {
        var roles=new[]{Rule(deny:Permission.SendMessages),Rule(allow:Permission.SendMessages)};
        Assert.True(PermissionRules.Resolve(Permission.Default,false,[],roles,[]).HasFlag(Permission.SendMessages));
        Assert.False(PermissionRules.Resolve(Permission.Default,false,[],roles,[Rule(deny:Permission.SendMessages)]).HasFlag(Permission.SendMessages));
    }
    [Fact] public void DependentCapabilitiesCannotSurviveMissingVisibilityConnectionOrWrite()
    {
        var result=PermissionRules.Resolve(Permission.Default,false,[],[],[Rule(deny:Permission.ConnectVoice|Permission.SendMessages)]);
        Assert.Equal(Permission.ViewChannel|Permission.AddReactions,result);
        Assert.Equal(Permission.None,PermissionRules.Resolve(Permission.Default,false,[],[],[Rule(deny:Permission.ViewChannel)]));
    }
    [Fact] public void HostOwnerAndAdministratorKeepRecoveryAccess()
    {
        Assert.Equal(Permission.All,PermissionRules.Resolve(Permission.None,true,[Rule(deny:Permission.ViewChannel)],[],[]));
        Assert.Equal(Permission.All,PermissionRules.Resolve(Permission.Administrator,false,[Rule(deny:Permission.ViewChannel)],[],[]));
    }
}
