using System.Text.RegularExpressions;
using Npgsql;

namespace Discorda.Infrastructure.Persistence;

public static partial class RuntimeDatabasePermissions
{
    public static string CreateSql(string role, string password)
    {
        if (!Identifier().IsMatch(role) || !Regex.IsMatch(password, "\\A[a-fA-F0-9]{64}\\z"))
            throw new ArgumentException("Invalid runtime credentials");
        // New roles only: never reset or take ownership of a pre-existing database account.
        // The password comes from a transaction-local parameter, never from logged SQL text.
        return $"DO $runtime$ BEGIN EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', '{role}', current_setting('discorda.runtime_password')); END $runtime$;";
    }
    [GeneratedRegex(@"\A[A-Za-z_][A-Za-z0-9_]{0,62}\z")]
    private static partial Regex Identifier();

    public static string GrantSql(string role)
    {
        if (!Identifier().IsMatch(role)) throw new ArgumentException("Invalid runtime role", nameof(role));
        // Identifiers cannot be SQL parameters. Quote using the provider after strict validation.
        using var builder = new NpgsqlCommandBuilder();
        var identifier = builder.QuoteIdentifier(role);
        return $"""
            REVOKE ALL ON ALL TABLES IN SCHEMA discorda FROM {identifier};
            REVOKE ALL ON SCHEMA discorda FROM {identifier};
            GRANT USAGE ON SCHEMA discorda TO {identifier};
            GRANT SELECT ON ALL TABLES IN SCHEMA discorda TO {identifier};
            GRANT INSERT, UPDATE ON discorda.users, discorda.allowed_users, discorda.application_sessions,
                discorda.workspaces, discorda.workspace_members, discorda.channels, discorda.messages, discorda.channel_reads TO {identifier};
            GRANT INSERT, DELETE ON discorda.message_reactions, discorda.message_pins, discorda.message_attachments TO {identifier};
            GRANT INSERT, UPDATE ON discorda.inbox_entries TO {identifier};
            GRANT INSERT, UPDATE ON discorda.server_invites, discorda.join_requests, discorda.storage_policy TO {identifier};
            GRANT INSERT, DELETE ON discorda.thread_follows TO {identifier};
            GRANT INSERT ON discorda.access_audit, discorda.management_audit TO {identifier};
            GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA discorda TO {identifier};
            """;
    }
}
