import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

/** ui-lib Button `iconSource` from a Lucide icon; `gap` spaces it from a label. */
export const uiIcon = (Icon: LucideIcon, color: string, size = 22, gap = 0) =>
  function ButtonIcon() {
    return (
      <View style={gap ? { marginRight: gap } : undefined}>
        <Icon size={size} color={color} strokeWidth={2} />
      </View>
    );
  };
