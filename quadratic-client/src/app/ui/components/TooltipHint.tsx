import { Tooltip } from '@mui/material';

interface TooltipHintProps {
  title: string | JSX.Element;
  shortcut?: string;
  children: React.ReactElement<any, any>;
  // Anything else for <Tooltip> you want to pass
  [x: string]: any;
}

export const TooltipHint = ({ title, shortcut, children, ...rest }: TooltipHintProps) => {
  return (
    <Tooltip
      arrow
      placement="top"
      title={
        <>
          {title} {shortcut && <span style={{ opacity: '.625' }}>({shortcut})</span>}
        </>
      }
      disableInteractive
      {...rest}
    >
      {children}
    </Tooltip>
  );
};
