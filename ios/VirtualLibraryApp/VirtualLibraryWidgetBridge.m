#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(VirtualLibraryWidgetBridge, NSObject)

RCT_EXTERN_METHOD(updateWidgetData:(NSString *)payload)
RCT_EXTERN_METHOD(setSelectedShelf:(NSString *)shelfId)
RCT_EXTERN_METHOD(reloadTimelines)

@end
