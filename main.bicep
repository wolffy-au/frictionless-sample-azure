param appName string = 'web-tier-${uniqueString(resourceGroup().id)}'
param location string = 'centralus'
param dbServerName string = 'sql-tier-${uniqueString(resourceGroup().id)}'
param dbName string = 'appdb'
param dbAdminUsername string = 'azureuser'

@secure()
param dbAdminPassword string

resource staticSite 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

resource sqlServer 'Microsoft.Sql/servers@2025-01-01' = {
  name: dbServerName
  location: location
  properties: {
    administratorLogin: dbAdminUsername
    administratorLoginPassword: dbAdminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2025-01-01' = {
  parent: sqlServer
  name: dbName
  location: location
  sku: {
    name: 'GP_S_Gen5'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 2
  }
  properties: {
    useFreeLimit: true
    freeLimitExhaustionBehavior: 'AutoPause'
    maxSizeBytes: 34359738368
    requestedBackupStorageRedundancy: 'Local'
  }
}

resource sqlFirewall 'Microsoft.Sql/servers/firewallRules@2021-11-01' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource staticSiteAppSettings 'Microsoft.Web/staticSites/config@2022-09-01' = {
  parent: staticSite
  name: 'appsettings'
  kind: 'string'
  properties: {
    SQL_SERVER: sqlServer.properties.fullyQualifiedDomainName
    SQL_DATABASE: dbName
    SQL_USER: dbAdminUsername
    SQL_PASSWORD: dbAdminPassword
  }
}

output staticWebAppName string = staticSite.name
output sqlServerName string = sqlServer.name
output sqlDatabaseName string = sqlDatabase.name
