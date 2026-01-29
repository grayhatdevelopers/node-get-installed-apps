// Updated test-mac.ts with mdls test added
import { getAppsFileInfo, getInstalledApps } from './mac';

async function test() {
  // Test with a known app directory, e.g., Calculator
  const testApps = ['/System/Applications/Calculator.app'];
  
  try {
    const result = await getAppsFileInfo(testApps);
    console.log('Test result:', result);
  } catch (error) {
    console.error('Test failed:', error);
  } 
}

async function testMdlsFailureFallbackToPlutil() {
  // Test with wrong-case path to existing app: mdls fails due to indexing issues, but plutil succeeds via case-insensitive filesystem
  const testApps = ['/Applications/activitywatch.app']; // Note: lowercase 'a', actual is 'ActivityWatch.app'
  
  try {
    const result = await getAppsFileInfo(testApps);
    console.log('Mdls Failure Fallback Test result:', result);
    
    // Expect mdls to fail, fallback to plutil to succeed, resulting in parsed data with method: 'plutil'
    if (result.length > 0 && result[0].method === 'plutil') {
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
    const allApps = await getInstalledApps('/Applications') as any[];
    console.log('All Apps Test result count:', allApps.length);
    
    // Basic assertion: should retrieve info for multiple apps
    if (allApps.length > 10) {
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
  await test();
  await testMdlsFailureFallbackToPlutil();
  
  console.log('\n--- Running new scan all apps test ---');
  await testAllApps();
}

runTests();
