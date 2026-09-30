namespace Discorda.Core.Channels;

public enum ChannelType { Text, Voice }

public sealed class Channel
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid WorkspaceId { get; init; }
    public required string Name { get; set; }
    public ChannelType Type { get; init; }
    public int SortOrder { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public long Version { get; set; } = 1;
}
