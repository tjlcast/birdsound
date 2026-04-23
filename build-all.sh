npm run build;
npx cap sync android;
npx cap open android;

cd android;
JAVA_HOME=/Users/jialiangtang/app/jdk-21.0.7+6/Contents/Home ./gradlew :app:assembleBenchmark
cd ..