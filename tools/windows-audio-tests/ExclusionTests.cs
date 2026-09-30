public sealed class ExclusionTests
{
    private static Dictionary<int,ProcessMap.Entry> Map(params (int Id,int Parent,string Name)[] values) => values.ToDictionary(v=>v.Id,v=>new ProcessMap.Entry(v.Id,v.Parent,v.Name));
    [Fact] public void ExcludesDiscordVariantsOwnerAndTheirChildren()
    {
        var map=Map((10,1,"Discorda.exe"),(11,10,"audio-service.exe"),(20,1,"DiscordCanary.exe"),(21,20,"helper.exe"),(30,1,"game.exe"),(40,1,"DiscordPTB.exe"),(50,1,"electron.exe"),(51,50,"renderer.exe"));
        Assert.Equal(new[]{30},ProcessMap.Allowed(new[]{10,11,20,21,30,40,51},map,50).Order());
    }
    [Fact] public void NeverCapturesAnAncestorThatWouldIncludeAnExcludedChild()
    {
        var map=Map((1,0,"launcher.exe"),(10,1,"Discord.exe"),(20,1,"game.exe"));
        Assert.Equal(new[]{20},ProcessMap.Allowed(new[]{1,20},map,10).Order());
    }
    [Fact] public void DeduplicatesNestedSessionTreesAndRejectsUnknownSystemSessions()
    {
        var map=Map((20,1,"browser.exe"),(21,20,"renderer.exe"),(30,1,"game.exe"));
        Assert.Equal(new[]{20,30},ProcessMap.Allowed(new[]{0,20,21,30,999},map,50).Order());
    }
    [Fact] public void OptionalBrowserExclusionCoversAudioServiceChildren()
    {
        var map=Map((20,1,"msedge.exe"),(21,20,"utility.exe"),(30,1,"game.exe"));
        Assert.Equal(new[]{30},ProcessMap.Allowed(new[]{21,30},map,50,true).Order());
        Assert.Equal(new[]{21,30},ProcessMap.Allowed(new[]{21,30},map,50,false).Order());
    }
    [Fact] public void ACorruptParentCycleDoesNotHang()
    {
        var map=Map((20,21,"one.exe"),(21,20,"two.exe"));
        Assert.False(ProcessMap.Descendant(20,99,map));
    }
}
