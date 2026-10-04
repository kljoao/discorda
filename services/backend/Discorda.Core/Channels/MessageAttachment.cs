namespace Discorda.Core.Channels;

public sealed class MessageAttachment
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public long MessageId { get; set; }
    public required string Name { get; init; }
    public required byte[] Content { get; init; }
    public int Size { get; init; }
}
