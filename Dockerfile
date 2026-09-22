FROM reactnativecommunity/react-native-android:latest
COPY forge13-builder.sh /usr/local/bin/forge13-builder.sh
RUN chmod +x /usr/local/bin/forge13-builder.sh
CMD ["/usr/local/bin/forge13-builder.sh"]
