// Updated test-win.ts with registry tests added
import { getInstalledApps, getApps, getAppData } from '../win';
import { Registry } from '../utils/registry';

async function testGetInstalledApps() {
  try {
    const allApps = await getInstalledApps() as any[];
    console.log('All Apps Test result count:', allApps.length);

    // Basic assertion: should retrieve info for multiple apps
    if (allApps.length > 0) {
      console.log('Successfully retrieved info for apps');
      // Log first few apps for verification
      console.log('First few apps:', allApps.slice(0, 3).map(app => ({
        name: app.appName,
        version: app.appVersion,
        identifier: app.appIdentifier
      })));
    } else {
      console.log('No apps retrieved');
    }
  } catch (error) {
    console.error('All Apps test failed:', error);
  }
}

async function testGetApps() {
  try {
    const regKey = new Registry({
      hive: Registry.HKLM,
      key: "\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    });

    const apps = await getApps(regKey) as any[];
    console.log('Get Apps Test result count:', apps.length);

    if (apps.length > 0) {
      console.log('Successfully retrieved apps from registry');
      console.log('First app:', {
        name: apps[0].appName,
        version: apps[0].appVersion,
        identifier: apps[0].appIdentifier
      });
    } else {
      console.log('No apps retrieved from registry');
    }
  } catch (error) {
    console.error('Get Apps test failed:', error);
  }
}

async function testGetAppData() {
  try {
    // This test is more complex as it requires a specific registry key
    // For now, we'll test with a mock or skip if no keys available
    console.log('Get App Data test: Requires specific registry key, skipping detailed test');
  } catch (error) {
    console.error('Get App Data test failed:', error);
  }
}

async function runTests() {
  console.log('--- Running Windows registry tests ---');

  console.log('\n--- Testing getInstalledApps ---');
  await testGetInstalledApps();

  console.log('\n--- Testing getApps ---');
  await testGetApps();

  console.log('\n--- Testing getAppData ---');
  await testGetAppData();
}

runTests();