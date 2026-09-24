$env:JAVA_HOME = "C:\Users\Pavithran\AppData\Local\Programs\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
$env:Path = "$env:JAVA_HOME\bin;C:\Users\Pavithran\AppData\Local\Android\Sdk\platform-tools;$env:Path"
.\gradlew.bat assembleRelease
