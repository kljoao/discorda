namespace Discorda.Core.Channels;

public sealed class InboxEntry
{
    public Guid UserId { get; init; }
    public long MessageId { get; init; }
    public bool Read { get; set; }
    public required string Kind { get; init; }
}

public sealed class ThreadFollow
{
    public Guid UserId { get; init; }
    public long MessageId { get; init; }
}
