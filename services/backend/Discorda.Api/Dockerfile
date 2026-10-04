FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props global.json ./
COPY apps/desktop/package.json apps/desktop/package.json
COPY services/backend/Discorda.Core/ services/backend/Discorda.Core/
COPY services/backend/Discorda.Infrastructure/ services/backend/Discorda.Infrastructure/
COPY services/backend/Discorda.Api/ services/backend/Discorda.Api/
RUN dotnet restore services/backend/Discorda.Api/Discorda.Api.csproj --locked-mode
RUN dotnet publish services/backend/Discorda.Api/Discorda.Api.csproj -c Release --no-restore -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
RUN mkdir -p /app/state && chown $APP_UID:$APP_UID /app/state
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Discorda.Api.dll"]
