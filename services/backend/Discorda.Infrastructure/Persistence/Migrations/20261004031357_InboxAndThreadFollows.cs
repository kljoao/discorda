using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Discorda.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InboxAndThreadFollows : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "inbox_entries",
                schema: "discorda",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    MessageId = table.Column<long>(type: "bigint", nullable: false),
                    Read = table.Column<bool>(type: "boolean", nullable: false),
                    Kind = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inbox_entries", x => new { x.UserId, x.MessageId });
                    table.ForeignKey(
                        name: "FK_inbox_entries_messages_MessageId",
                        column: x => x.MessageId,
                        principalSchema: "discorda",
                        principalTable: "messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_inbox_entries_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "discorda",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "thread_follows",
                schema: "discorda",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    MessageId = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_thread_follows", x => new { x.UserId, x.MessageId });
                    table.ForeignKey(
                        name: "FK_thread_follows_messages_MessageId",
                        column: x => x.MessageId,
                        principalSchema: "discorda",
                        principalTable: "messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_thread_follows_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "discorda",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_inbox_entries_MessageId",
                schema: "discorda",
                table: "inbox_entries",
                column: "MessageId");

            migrationBuilder.CreateIndex(
                name: "IX_inbox_entries_UserId_Read_MessageId",
                schema: "discorda",
                table: "inbox_entries",
                columns: new[] { "UserId", "Read", "MessageId" });

            migrationBuilder.CreateIndex(
                name: "IX_thread_follows_MessageId",
                schema: "discorda",
                table: "thread_follows",
                column: "MessageId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "inbox_entries",
                schema: "discorda");

            migrationBuilder.DropTable(
                name: "thread_follows",
                schema: "discorda");
        }
    }
}
