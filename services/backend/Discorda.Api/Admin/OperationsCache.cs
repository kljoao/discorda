namespace Discorda.Api.Admin;

// One bounded probe per server, shared by concurrent owner sessions.
public sealed class OperationsCache
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private object? snapshot;
    private DateTimeOffset expires;
    public async Task<object> Get(Func<Task<object>> probe, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            if (snapshot is not null && DateTimeOffset.UtcNow < expires) return snapshot;
            snapshot = await probe();
            expires = DateTimeOffset.UtcNow.AddSeconds(15);
            return snapshot;
        }
        finally { gate.Release(); }
    }
}
