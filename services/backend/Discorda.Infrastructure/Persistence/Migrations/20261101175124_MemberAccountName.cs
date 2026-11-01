using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Discorda.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MemberAccountName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccountDisplayName",
                schema: "discorda",
                table: "users",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);
            migrationBuilder.Sql("UPDATE discorda.users SET \"AccountDisplayName\"=\"DisplayName\" WHERE \"CustomDisplayName\" IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AccountDisplayName",
                schema: "discorda",
                table: "users");
        }
    }
}
