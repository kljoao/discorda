using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Discorda.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class VoiceChannels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                INSERT INTO discorda.channels ("Id", "WorkspaceId", "Name", "Type", "SortOrder", "Version") VALUES
                ('bde069ed-d1c4-4930-92d3-9360eab43cb8', '786f3c3b-14ca-4c93-b0a1-9f782ef8c044', 'Sala de voz', 'Voice', 0, 1),
                ('3fb4d789-a71b-4427-b1de-232fddebc519', '786f3c3b-14ca-4c93-b0a1-9f782ef8c044', 'Jogando juntos', 'Voice', 1, 1) ON CONFLICT DO NOTHING;
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}

