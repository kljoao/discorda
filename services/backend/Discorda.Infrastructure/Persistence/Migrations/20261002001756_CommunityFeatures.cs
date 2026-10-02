using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using NpgsqlTypes;

#nullable disable

namespace Discorda.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CommunityFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_member_role",
                schema: "discorda",
                table: "workspace_members");

            migrationBuilder.AddColumn<NpgsqlTsVector>(
                name: "SearchVector",
                schema: "discorda",
                table: "messages",
                type: "tsvector",
                nullable: true,
                computedColumnSql: "to_tsvector('portuguese', \"Body\")",
                stored: true);

            migrationBuilder.CreateTable(
                name: "channel_reads",
                schema: "discorda",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChannelId = table.Column<Guid>(type: "uuid", nullable: false),
                    MessageId = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_channel_reads", x => new { x.UserId, x.ChannelId });
                    table.ForeignKey(
                        name: "FK_channel_reads_channels_ChannelId",
                        column: x => x.ChannelId,
                        principalSchema: "discorda",
                        principalTable: "channels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_channel_reads_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "discorda",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "management_audit",
                schema: "discorda",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Target = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_management_audit", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "message_pins",
                schema: "discorda",
                columns: table => new
                {
                    MessageId = table.Column<long>(type: "bigint", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_message_pins", x => x.MessageId);
                    table.ForeignKey(
                        name: "FK_message_pins_messages_MessageId",
                        column: x => x.MessageId,
                        principalSchema: "discorda",
                        principalTable: "messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_message_pins_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "discorda",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "message_reactions",
                schema: "discorda",
                columns: table => new
                {
                    MessageId = table.Column<long>(type: "bigint", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Emoji = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_message_reactions", x => new { x.MessageId, x.UserId, x.Emoji });
                    table.ForeignKey(
                        name: "FK_message_reactions_messages_MessageId",
                        column: x => x.MessageId,
                        principalSchema: "discorda",
                        principalTable: "messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_message_reactions_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "discorda",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_member_role",
                schema: "discorda",
                table: "workspace_members",
                sql: "\"Role\" IN ('Owner', 'Member', 'Admin', 'Moderator')");

            migrationBuilder.CreateIndex(
                name: "IX_messages_SearchVector",
                schema: "discorda",
                table: "messages",
                column: "SearchVector")
                .Annotation("Npgsql:IndexMethod", "GIN");

            migrationBuilder.CreateIndex(
                name: "IX_channel_reads_ChannelId",
                schema: "discorda",
                table: "channel_reads",
                column: "ChannelId");

            migrationBuilder.CreateIndex(
                name: "IX_management_audit_CreatedAt",
                schema: "discorda",
                table: "management_audit",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_message_pins_UserId",
                schema: "discorda",
                table: "message_pins",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_message_reactions_UserId",
                schema: "discorda",
                table: "message_reactions",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "channel_reads",
                schema: "discorda");

            migrationBuilder.DropTable(
                name: "management_audit",
                schema: "discorda");

            migrationBuilder.DropTable(
                name: "message_pins",
                schema: "discorda");

            migrationBuilder.DropTable(
                name: "message_reactions",
                schema: "discorda");

            migrationBuilder.DropCheckConstraint(
                name: "ck_member_role",
                schema: "discorda",
                table: "workspace_members");

            migrationBuilder.DropIndex(
                name: "IX_messages_SearchVector",
                schema: "discorda",
                table: "messages");

            migrationBuilder.DropColumn(
                name: "SearchVector",
                schema: "discorda",
                table: "messages");

            migrationBuilder.Sql("UPDATE discorda.workspace_members SET \"Role\"='Member' WHERE \"Role\" IN ('Admin','Moderator')");
            migrationBuilder.AddCheckConstraint(
                name: "ck_member_role",
                schema: "discorda",
                table: "workspace_members",
                sql: "\"Role\" IN ('Owner', 'Member')");
        }
    }
}
