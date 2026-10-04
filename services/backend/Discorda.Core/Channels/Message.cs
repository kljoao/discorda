namespace Discorda.Core.Channels;

public sealed class Message
{
    public long? ThreadRootId { get; init; }
    public long Id { get; set; }
    public Guid ChannelId { get; init; }
    public Guid AuthorId { get; init; }
    public Guid ClientId { get; init; }
    public required string Body { get; set; }
    public long? ReplyToId { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? EditedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public long Version { get; set; } = 1;
}
