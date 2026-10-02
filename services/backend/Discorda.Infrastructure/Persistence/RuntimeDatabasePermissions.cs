using System.Text.RegularExpressions;
using Npgsql;

namespace Discorda.Infrastructure.Persistence;

public static partial class RuntimeDatabasePermissions
{
    [GeneratedRegex(@"\A[A-Za-z_][A-Za-z0-9_]{0,62}\z")]
    private static partial Regex Identifier();

    public static string GrantSql(string role)
    {
        if (!Identifier().IsMatch(role)) throw new ArgumentException("Invalid runtime role", nameof(role));
        // Identifiers cannot be SQL parameters. Quote using the provider after strict validation.
        using var builder = new NpgsqlCommandBuilder();
        var identifier = builder.QuoteIdentifier(role);
        return $"GRANT USAGE ON SCHEMA discorda TO {identifier}; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA discorda TO {identifier}; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA discorda TO {identifier};";
    }
}
