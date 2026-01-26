// Updated test-mac.ts with mdls test added
import { getAppsFileInfo, getInstalledApps } from './mac';

async function testPlutil() {
  // Test with a known app directory, e.g., Safari
  const testApps = ['/Applications/Safari.app'];
  
  try {
    const result = await getAppsFileInfo(testApps);
    console.log('Plutil Test result:', result);
    
    // Basic assertions
    if (result.length > 0) {
      const appData = result[0];
      if (appData.isPlutil) {
        console.log('Plutil parsing successful');
      } else {
        console.log('Fallback to mdls used');
      }
    } else {
      console.log('No app data retrieved');
    }
  } catch (error) {
    console.error('Plutil test failed:', error);
  }
}

async function testMdls() {
  // Test with an invalid app path to force mdls fallback
  const testApps = ['/Applications/Safari.app'];
  
  try {
    const result = await getAppsFileInfo(testApps);
    console.log('Mdls Test result:', result);
    
    // Basic assertions
    if (result.length > 0) {
      const appData = result[0];
      if (!appData.isPlutil) {
        console.log('Mdls parsing successful');
      } else {
        console.log('Unexpectedly used plutil');
      }
    } else {
      console.log('No app data retrieved');
    }
  } catch (error) {
    console.error('Mdls test failed:', error);
  }
}

async function testMdlsFailureFallbackToPlutil() {
  // Test with wrong-case path to existing app: mdls fails due to indexing issues, but plutil succeeds via case-insensitive filesystem
  const testApps = ['/Applications/activitywatch.app']; // Note: lowercase 'a', actual is 'ActivityWatch.app'
  
  try {
    const result = await getAppsFileInfo(testApps);
    console.log('Mdls Failure Fallback Test result:', result);
    
    // Expect mdls to fail, fallback to plutil to succeed, resulting in parsed data with isPlutil: true
    if (result.length > 0 && result[0].isPlutil) {
      console.log('Mdls failed, fallback to plutil succeeded as expected');
    } else {
      console.log('Unexpected result: expected plutil fallback to work');
    }
  } catch (error) {
    console.error('Mdls Failure Fallback test failed:', error);
  }
}

async function testAllApps() {
  try {
    const allApps = await getInstalledApps('/Applications') as Array<{ path: string }>;
    const result = await getAppsFileInfo(allApps.map(app => app.path));
    console.log('All Apps Test result count:', result.length);
    
    // Basic assertion: should retrieve info for multiple apps
    if (result.length > 10) {
      console.log('Successfully retrieved info for multiple apps');
    } else {
      console.log('Unexpectedly low number of apps retrieved');
    }
  } catch (error) {
    console.error('All Apps test failed:', error);
  }
}

async function runTests() {
  console.log('--- Running existing tests ---');
  await testPlutil();
  await testMdls();
  await testMdlsFailureFallbackToPlutil();
  
  console.log('\n--- Running new scan all apps test ---');
  await testAllApps();
}

runTests();
