using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Discorda.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PersistentChat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                INSERT INTO discorda.workspaces ("Id", "Name", "CreatedAt")
                VALUES ('786f3c3b-14ca-4c93-b0a1-9f782ef8c044', 'Nosso grupo', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
                INSERT INTO discorda.channels ("Id", "WorkspaceId", "Name", "Type", "SortOrder", "Version") VALUES
                ('225a47d7-779e-4992-89d2-03b1517f9112', '786f3c3b-14ca-4c93-b0a1-9f782ef8c044', 'geral', 'Text', 0, 1),
                ('190d597d-6a85-42b0-a855-8c85f93e4cdf', '786f3c3b-14ca-4c93-b0a1-9f782ef8c044', 'jogos', 'Text', 1, 1),
                ('65c2fcaa-3eea-4776-bf92-a7150a757af8', '786f3c3b-14ca-4c93-b0a1-9f782ef8c044', 'aleatorio', 'Text', 2, 1)
                ON CONFLICT DO NOTHING;
                """);
            migrationBuilder.CreateTable(
                name: "messages",
                schema: "discorda",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ChannelId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Body = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    ReplyToId = table.Column<long>(type: "bigint", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EditedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_messages", x => x.Id);
                    table.CheckConstraint("ck_message_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_messages_channels_ChannelId",
                        column: x => x.ChannelId,
                        principalSchema: "discorda",
                        principalTable: "channels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_messages_messages_ReplyToId",
                        column: x => x.ReplyToId,
                        principalSchema: "discorda",
                        principalTable: "messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_messages_users_AuthorId",
                        column: x => x.AuthorId,
                        principalSchema: "discorda",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_messages_AuthorId_ClientId",
                schema: "discorda",
                table: "messages",
                columns: new[] { "AuthorId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_messages_ChannelId_Id",
                schema: "discorda",
                table: "messages",
                columns: new[] { "ChannelId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_messages_ReplyToId",
                schema: "discorda",
                table: "messages",
                column: "ReplyToId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "messages",
                schema: "discorda");
        }
    }
}
